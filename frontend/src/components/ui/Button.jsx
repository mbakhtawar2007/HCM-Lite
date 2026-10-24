export default function Button({ variant = 'primary', children, ref, className = '', ...props }) {
  return (
    <button ref={ref} className={`btn btn-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
