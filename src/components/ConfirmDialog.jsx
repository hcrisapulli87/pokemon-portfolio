// Reusable dark confirm modal.
export default function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b1020] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              'rounded-lg px-3 py-2 text-sm font-medium text-white transition ' +
              (danger
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-indigo-600 hover:bg-indigo-500')
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
