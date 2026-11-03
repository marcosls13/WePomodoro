import { useState } from 'react';
import { useProfileStore } from '../store/profileStore'; 

export default function Profile() {
  const user = useProfileStore((state) => state.user);
  const updateUsername = useProfileStore((state) => state.updateUsername);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.name || '');

  const handleSave = async () => {
    if (draftName.trim() === '' || draftName === user?.name) {
      setIsEditing(false);
      return;
    } 
    await updateUsername(draftName);
    setIsEditing(false);
  };

  if (!user) return <div className="animate-pulse text-gray-500">Cargando perfil...</div>;

  return (
    <div className="space-y-8">
      <section className="flex items-center space-x-6">
        <div className="w-24 h-24 rounded-full bg-gray-200 border-2 border-gray-300 overflow-hidden flex-shrink-0">
          <img 
            src={user.avatarUrl || '/default-avatar.png'} 
            alt={`Avatar de ${user.name}`} 
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Información General</h1>
        </div>
      </section>

      <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
        <div className="flex flex-col space-y-4">
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Nombre de usuario (Login)</span>
            <span className="text-sm font-mono bg-gray-200 px-2 py-1 rounded">{user.login_42}</span>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-600">Apodo (Display Name)</span>
            
            {isEditing ? (
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-black outline-none"
                  autoFocus
                />
                <button 
                  onClick={handleSave}
                  className="px-4 py-1 bg-black text-white font-medium rounded hover:bg-gray-800 transition-colors"
                >
                  Guardar
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1 bg-gray-200 text-gray-800 font-medium rounded hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <span className="text-base font-semibold">{user.name}</span>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Editar
                </button>
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
