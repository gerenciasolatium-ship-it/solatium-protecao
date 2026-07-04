import { inputClass, labelClass } from '../lib/ui';

interface CampoProps {
  label: string;
  valor: string;
  onChange: (valor: string) => void;
  tipo?: string;
  obrigatorio?: boolean;
  placeholder?: string;
  className?: string;
}

export function Campo({
  label,
  valor,
  onChange,
  tipo = 'text',
  obrigatorio = false,
  placeholder,
  className,
}: CampoProps) {
  return (
    <div className={className}>
      <label className={labelClass}>
        {label}
        {obrigatorio && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={tipo}
        required={obrigatorio}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

interface OpcaoSelect {
  valor: string;
  rotulo: string;
}

interface CampoSelectProps {
  label: string;
  valor: string;
  onChange: (valor: string) => void;
  opcoes: OpcaoSelect[];
  obrigatorio?: boolean;
  placeholder?: string;
  className?: string;
}

export function CampoSelect({
  label,
  valor,
  onChange,
  opcoes,
  obrigatorio = false,
  placeholder,
  className,
}: CampoSelectProps) {
  return (
    <div className={className}>
      <label className={labelClass}>
        {label}
        {obrigatorio && <span className="text-red-500"> *</span>}
      </label>
      <select
        required={obrigatorio}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}
