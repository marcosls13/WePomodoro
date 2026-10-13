interface FormHeaderProps {
  title: string;
  subtitle: string;
}

export function FormHeader ({title, subtitle}: FormHeaderProps) {
  return (
    <div className="mb-8 text-center">
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}
