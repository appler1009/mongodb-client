// frontend/src/components/Dialog.tsx
import React from 'react';

interface DialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) => {
  return (
    // Overlay for the dialog to prevent interaction with background content
    <div className="dialog-overlay">
      <div className="dialog-content">
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-button cancel-button" onClick={onCancel}>
            {cancelText}
          </button>
          <button className="dialog-button confirm-button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
