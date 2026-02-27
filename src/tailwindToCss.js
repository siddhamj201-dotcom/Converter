const spacingScale = {
  '0': '0rem',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem'
};

const colorMap = {
  'white': '#ffffff',
  'black': '#000000',
  'gray-100': '#f3f4f6',
  'gray-200': '#e5e7eb',
  'gray-500': '#6b7280',
  'gray-700': '#374151',
  'gray-900': '#111827',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'red-500': '#ef4444',
  'green-500': '#22c55e'
};

function escapeClassName(cls) {
  return cls.replace(/:/g, '\\:').replace(/\//g, '\\/');
}

function convertClass(cls) {
  if (cls === 'flex') return 'display: flex;';
  if (cls === 'grid') return 'display: grid;';
  if (cls === 'block') return 'display: block;';
  if (cls === 'hidden') return 'display: none;';
  if (cls === 'items-center') return 'align-items: center;';
  if (cls === 'justify-center') return 'justify-content: center;';
  if (cls === 'font-bold') return 'font-weight: 700;';
  if (cls === 'font-semibold') return 'font-weight: 600;';
  if (cls === 'rounded') return 'border-radius: 0.25rem;';
  if (cls === 'rounded-lg') return 'border-radius: 0.5rem;';
  if (cls === 'w-full') return 'width: 100%;';
  if (cls === 'h-full') return 'height: 100%;';

  const textSize = cls.match(/^text-(xs|sm|base|lg|xl)$/);
  if (textSize) {
    const map = { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem' };
    return `font-size: ${map[textSize[1]]};`;
  }

  const spacing = cls.match(/^(p|m|px|py|pt|pr|pb|pl|mx|my|mt|mr|mb|ml)-([0-9]+)$/);
  if (spacing && spacingScale[spacing[2]]) {
    const v = spacingScale[spacing[2]];
    const prop = spacing[1];
    const m = {
      p: `padding: ${v};`,
      m: `margin: ${v};`,
      px: `padding-left: ${v}; padding-right: ${v};`,
      py: `padding-top: ${v}; padding-bottom: ${v};`,
      pt: `padding-top: ${v};`,
      pr: `padding-right: ${v};`,
      pb: `padding-bottom: ${v};`,
      pl: `padding-left: ${v};`,
      mx: `margin-left: ${v}; margin-right: ${v};`,
      my: `margin-top: ${v}; margin-bottom: ${v};`,
      mt: `margin-top: ${v};`,
      mr: `margin-right: ${v};`,
      mb: `margin-bottom: ${v};`,
      ml: `margin-left: ${v};`
    };
    return m[prop];
  }

  const bgColor = cls.match(/^bg-(.+)$/);
  if (bgColor && colorMap[bgColor[1]]) return `background-color: ${colorMap[bgColor[1]]};`;

  const textColor = cls.match(/^text-(gray-100|gray-200|gray-500|gray-700|gray-900|white|black|blue-500|blue-600|red-500|green-500)$/);
  if (textColor && colorMap[textColor[1]]) return `color: ${colorMap[textColor[1]]};`;

  return null;
}

function generateCssFromTailwindClasses(classes) {
  const lines = ['/* Generated CSS from discovered Tailwind classes (subset support) */'];

  classes.forEach((cls) => {
    const rule = convertClass(cls);
    if (rule) {
      lines.push(`.${escapeClassName(cls)} { ${rule} }`);
    } else {
      lines.push(`/* TODO: Unsupported Tailwind class: ${cls} */`);
    }
  });

  return lines.join('\n');
}

module.exports = { generateCssFromTailwindClasses };
