import { useEffect, useId, useRef, type ReactNode } from 'react'

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    return () => {
      dialog.close()
      requestAnimationFrame(() => {
        if (focus?.isConnected && focus.getClientRects().length) focus.focus()
        else document.getElementById('contenu')?.focus()
      })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="content-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Fermer la fenêtre"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
