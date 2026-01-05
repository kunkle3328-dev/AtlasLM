import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onSave: (key: string) => void;
  onClose: () => void;
  existingKey: string;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onSave, onClose, existingKey }) => {
  const [key, setKey] = useState(existingKey);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-6 rounded-xl shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Google Gemini API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-neon transition-colors"
          />
          <p className="text-xs text-gray-500 mt-2">
            Your key is stored locally in your browser. A paid key is recommended for higher rate limits.
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(key)}
            className="px-4 py-2 bg-neon/10 border border-neon/50 text-neon rounded-lg hover:bg-neon/20 transition-colors font-medium"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
};