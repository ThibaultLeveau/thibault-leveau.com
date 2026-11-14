"""Récupération locale du compte, sans supprimer les réglages du fournisseur."""

import getpass
import re

from personal_site.admin.security import password_hash
from personal_site.admin.store import AdminStore
from personal_site.config import Settings


def main():
    settings = Settings()
    if not settings.admin_enabled:
        raise SystemExit("Activez SITE_ADMIN_ENABLED pour récupérer le compte.")
    store = AdminStore(settings)
    account = store.account()
    username = input("Nouveau nom d’utilisateur : ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,64}", username):
        raise SystemExit("Nom invalide : 3 à 64 lettres, chiffres, points, _ ou -.")
    password = getpass.getpass("Nouveau mot de passe (12 à 128 caractères) : ")
    if not 12 <= len(password) <= 128 or password != getpass.getpass(
        "Confirmer le mot de passe : "
    ):
        raise SystemExit("Mot de passe invalide ou confirmation différente.")
    if not store.update_account(username, password_hash(password), account):
        raise SystemExit("Le compte a changé pendant l’opération ; recommencez.")
    print("Compte mis à jour. Toutes les sessions sont révoquées.")


if __name__ == "__main__":
    main()
