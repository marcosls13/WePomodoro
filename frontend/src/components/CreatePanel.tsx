import { useState } from 'react';
import { SubmitButton } from "../components/SubmitButton";
import { FormHeader } from "../components/FormHeader";
import  FormWrapper from "../components/FormWrapper";

type PanelMode = 'idle' | 'create' | 'join';

interface SignInFormProps {
  onSwitchMode: () => void;
}

export default function CreatePanel({ onSwitchMode }: SigInFormProps) {
  const [mode, setMode] = useState<PanelMode>('idle');
  const [inputValue, setInputValue] = useState('');

  const handleAction = (targetMode: 'create' | 'join') => {
    if (mode === 'idle') {
      setMode(targetMode);
      setInputValue('');
      return;
    }

    if (mode === targetMode) {
      if (inputValue.trim() === '') return;
      console.log(`Acción: ${targetMode}, Valor: ${inputValue}`);
    }
  };

  return (
    <FormWrapper>
    <section className="flex flex-col flex-auto items-center justify-center min-h-[300px]">
      <FormHeader title="Join the session" subtitle="Come on bro"/>
      <div className="relative flex flex-col items-center justify-center w-full">
        
        <div 
          className={`flex flex-col items-center transition-all duration-500 ease-out overflow-hidden
            ${mode === 'join' ? 'max-h-0 opacity-0 pointer-events-none transform -translate-y-4' : 'max-h-48 opacity-100 transform translate-y-0'}
          `}
        >
          <div 
            className={`transition-all duration-500 ease-out overflow-hidden flex flex-col items-center w-full
              ${mode === 'create' ? 'max-h-20 opacity-100 mb-4 transform scale-100' : 'max-h-0 opacity-0 mb-0 transform scale-95'}
            `}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter room name"
              className="px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 w-64"
            />
          </div>
          
          <SubmitButton onClick={() => handleAction('create')}>
            {mode === 'create' ? 'Create Room' : 'Create Room'}
          </SubmitButton>
        </div>

        <div 
          className={`flex flex-col items-center transition-all duration-500 ease-out overflow-hidden
            ${mode === 'create' ? 'max-h-0 opacity-0 pointer-events-none transform translate-y-4' : 'max-h-48 opacity-100 transform translate-y-0 mt-4'}
            ${mode === 'join' && 'mt-0'} 
          `}
        >
          <div 
            className={`transition-all duration-500 ease-out overflow-hidden flex flex-col items-center w-full
              ${mode === 'join' ? 'max-h-20 opacity-100 mb-4 transform scale-100' : 'max-h-0 opacity-0 mb-0 transform scale-95'}
            `}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Room code"
              className="px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 uppercase w-64"
            />
          </div>
          
          <SubmitButton onClick={() => handleAction('join')}>
            {mode === 'join' ? 'Join Room' : 'Join Room'}
          </SubmitButton>
        </div>

      </div>

      <div className={`transition-all duration-500 ease-out mt-6 ${mode !== 'idle' ? 'opacity-100 transform translate-y-0' : 'opacity-0 pointer-events-none transform translate-y-2'}`}>
        <button 
          onClick={() => setMode('idle')}
          className="text-sm font-bold text-gray-400 hover:text-black transition-colors"
        >
          Cancel
        </button>
      </div>
<button 
        onClick={onSwitchMode}
        className="mt-4 text-sm font-bold text-gray-500 hover:text-black transition-colors"
      >
        Discover our advantages by Signing Up
      </button>
    </section>
    </FormWrapper>
  );
}
