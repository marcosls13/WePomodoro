export const mockLogin = async (username: string): Promise<string> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`fake_jwt_for_${username}.payload.signature`);
    }, 800);
  });
};
