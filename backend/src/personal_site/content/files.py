"""Téléversement en flux, formats fermés et publication atomique dans le volume privé."""

import hashlib
import os
import secrets
import tempfile
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from personal_site.content.store import insert
from personal_site.content.validation import ContentError, validate

MIB = 1024 * 1024
FORMATS = {
    "image/jpeg": ("image", ".jpg", 10 * MIB, "JPEG"),
    "image/png": ("image", ".png", 10 * MIB, "PNG"),
    "image/webp": ("image", ".webp", 10 * MIB, "WEBP"),
    "application/pdf": ("document", ".pdf", 20 * MIB, None),
    "video/mp4": ("video", ".mp4", 100 * MIB, None),
    "video/webm": ("video", ".webm", 100 * MIB, None),
}


def inspect_file(path, mime):
    nature, _, _, image_format = FORMATS[mime]
    width = height = None
    try:
        if nature == "image":
            with Image.open(path, formats=[image_format]) as img:
                width, height = img.size
                if width * height > 20_000_000 or getattr(img, "n_frames", 1) != 1:
                    raise ValueError("dimensions")
                img.verify()
            with Image.open(path, formats=[image_format]) as img:
                img.load()  # Verify compressed pixels too; the header alone is insufficient.
        else:
            with path.open("rb") as stream:
                header = stream.read(64)
                if mime == "application/pdf":
                    stream.seek(max(0, path.stat().st_size - 1024))
                    valid = header.startswith(b"%PDF-") and b"%%EOF" in stream.read()
                elif mime == "video/mp4":
                    valid = len(header) >= 16 and header[4:8] == b"ftyp"
                else:
                    valid = header.startswith(b"\x1aE\xdf\xa3") and b"webm" in header
                if not valid:
                    raise ValueError("signature")
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        raise ContentError(
            "Le contenu du fichier ne correspond pas au format annoncé, ou l'image "
            "dépasse 20 millions de pixels. Les images animées ne sont pas acceptées."
        ) from None
    return width, height


class MediaFiles:
    def __init__(self, content, quota):
        self.content, self.quota = content, quota
        self.directory = content.admin.path.parent / "media"
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)

    async def upload(self, request, filename):
        mime = request.headers.get("content-type", "").split(";", 1)[0].lower()
        if mime not in FORMATS:
            raise ContentError("Formats acceptés : JPEG, PNG, WebP, PDF, MP4 et WebM.", status=415)
        nature, extension, limit, _ = FORMATS[mime]
        limit = min(limit, self.quota)
        declared = request.headers.get("content-length")
        if declared and (not declared.isdigit() or int(declared) > limit):
            raise ContentError("Le fichier dépasse la taille autorisée.", status=413)
        original = Path(filename.replace("\\", "/")).name
        if not original or any(ord(c) < 32 or ord(c) == 127 for c in original):
            raise ContentError("Nom de fichier invalide.")
        fd, path = tempfile.mkstemp(prefix=".upload-", dir=self.directory)
        temporary = Path(path)
        size, digest = 0, hashlib.sha256()
        try:
            with os.fdopen(fd, "wb") as stream:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > limit:
                        raise ContentError("Le fichier dépasse la taille autorisée.", status=413)
                    digest.update(chunk)
                    await run_in_threadpool(stream.write, chunk)
                await run_in_threadpool(stream.flush)
                await run_in_threadpool(os.fsync, stream.fileno())
            if not size:
                raise ContentError("Le fichier est vide.")
            return await run_in_threadpool(
                self.finish, temporary, original, mime, nature, extension, size, digest.hexdigest()
            )
        finally:
            temporary.unlink(missing_ok=True)

    def finish(self, temporary, original, mime, nature, extension, size, digest):
        width, height = inspect_file(temporary, mime)
        name = secrets.token_hex(24) + extension
        final = self.directory / name
        try:
            with self.content.admin.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                used = db.execute("SELECT coalesce(sum(size), 0) FROM media_files").fetchone()[0]
                if used + size > self.quota:
                    raise ContentError(
                        "Le quota de la médiathèque est atteint. Supprimez des fichiers "
                        "inutilisés ou adaptez le quota.",
                        status=413,
                    )
                data = validate(
                    "media",
                    {
                        "title": original[:160],
                        "slug": "media-" + secrets.token_hex(8),
                        "source": "file",
                        "nature": nature,
                    },
                )
                ident = self.content.write(db, "media", data, uploaded=True)
                os.replace(temporary, final)
                # Persist the rename before committing the reference in SQLite.
                descriptor = os.open(self.directory, os.O_RDONLY)
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
                insert(
                    db,
                    "media_files",
                    {
                        "entry_id": ident,
                        "storage_name": name,
                        "original_name": original,
                        "mime": mime,
                        "size": size,
                        "sha256": digest,
                        "width": width,
                        "height": height,
                    },
                )
        except BaseException:
            final.unlink(missing_ok=True)
            raise
        return self.content.get("media", ident)

    def file(self, ident):
        with self.content.admin.connect() as db:
            row = db.execute("SELECT * FROM media_files WHERE entry_id = ?", (ident,)).fetchone()
            if not row:
                raise ContentError("Fichier introuvable.", status=404)
            return dict(row)

    def usage(self):
        with self.content.admin.connect() as db:
            used = db.execute("SELECT coalesce(sum(size), 0) FROM media_files").fetchone()[0]
        return {"used": used, "quota": self.quota}
