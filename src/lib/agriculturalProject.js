export const CROP_OPTIONS = [
  { code: 'PEANUT', label: 'Arachide' },
  { code: 'BANANA', label: 'Banane' },
  { code: 'CARROT', label: 'Carotte' },
  { code: 'CABBAGE', label: 'Chou' },
  { code: 'OKRA', label: 'Gombo' },
  { code: 'MAIZE', label: 'Maïs' },
  { code: 'CASSAVA', label: 'Manioc' },
  { code: 'MILLET', label: 'Mil' },
  { code: 'COWPEA', label: 'Niébé' },
  { code: 'ONION', label: 'Oignon' },
  { code: 'WATERMELON', label: 'Pastèque' },
  { code: 'SWEET_POTATO', label: 'Patate douce' },
  { code: 'CHILI', label: 'Piment' },
  { code: 'POTATO', label: 'Pomme de terre' },
  { code: 'RICE', label: 'Riz' },
  { code: 'SORGHUM', label: 'Sorgho' },
  { code: 'TOMATO', label: 'Tomate' },
];

export const OTHER_CROP_VALUE = 'OTHER';

function customCropCode(label) {
  const slug = Array.from(label.normalize('NFD'))
    .filter(character => character.codePointAt(0) < 0x300 || character.codePointAt(0) > 0x36f)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug ? `CUSTOM_${slug}` : null;
}

export function resolveCrop(selection, otherLabel = '') {
  if (selection === OTHER_CROP_VALUE) {
    const label = otherLabel.trim();
    return label ? { crop_code: customCropCode(label), crop_label: label } : { crop_code: null, crop_label: null };
  }

  const crop = CROP_OPTIONS.find(item => item.code === selection);
  return crop ? { crop_code: crop.code, crop_label: crop.label } : { crop_code: null, crop_label: null };
}

export function cropSelectionFromProject(project = {}) {
  const match = CROP_OPTIONS.find(item => item.code === project.crop_code);
  if (match) return { selection: match.code, otherLabel: '' };
  const customLabel = typeof project.crop_label === 'string' ? project.crop_label.trim() : '';
  return customLabel
    ? { selection: OTHER_CROP_VALUE, otherLabel: customLabel }
    : { selection: '', otherLabel: '' };
}
