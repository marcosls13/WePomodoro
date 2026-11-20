export const mockLogin = async (username: string): Promise<string> => {
  return new Promise((resolve) => {
    // Simulamos 800ms de latencia de red
    setTimeout(() => {
      // Devolvemos un string con estructura de JWT falso
      resolve(`fake_jwt_for_${username}.payload.signature`);
    }, 800);
  });
};
