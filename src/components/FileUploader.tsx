import React, { useRef } from 'react';

interface FileUploaderProps {
  onFileSelect: (files: FileList) => void;
  disabled?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
      // Reset input so the same file can be selected again if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="file-uploader">
      <input
        type="file"
        ref={inputRef}
        onChange={handleChange}
        style={{ display: 'none' }}
        multiple
        disabled={disabled}
      />
      <button
        className="upload-btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        type="button"
      >
        📂 Attach Files (Images, Video, PDF, Zip...)
      </button>

      <style>{`
        .file-uploader {
          margin-top: 12px;
        }
        .upload-btn {
          width: 100%;
          padding: 16px;
          background: #607d8b;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .upload-btn:hover:not(:disabled) {
          background: #546e7a;
        }
        .upload-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};