import * as RadixDialog from '@radix-ui/react-dialog';

// Radix supplies the behavior (focus trap, ESC to close, backdrop click,
// portal) that's genuinely worth not hand-rolling; organic.css supplies
// the look via .dialog-backdrop/.dialog. Overlay and Content are Radix's
// usual siblings, not nested — the backdrop covers the viewport, the
// content is centered independently.
export function Dialog({ open, onOpenChange, children }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-backdrop" />
        <RadixDialog.Content
          className="dialog"
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogTitle({ children }) {
  return <RadixDialog.Title className="dialog-title">{children}</RadixDialog.Title>;
}

export function DialogDescription({ children, asChild }) {
  return (
    <RadixDialog.Description asChild={asChild} className={asChild ? undefined : 'dialog-body'}>
      {children}
    </RadixDialog.Description>
  );
}

export function DialogActions({ children }) {
  return <div className="dialog-actions">{children}</div>;
}

export const DialogClose = RadixDialog.Close;
