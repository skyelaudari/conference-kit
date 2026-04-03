// Lightweight rendering helpers
export function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    let val = values[i] !== undefined ? values[i] : '';
    if (Array.isArray(val)) val = val.join('');
    return result + str + val;
  }, '');
}

export function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function tierClass(tier) {
  if (!tier) return 'tier-3';
  if (tier.includes('1')) return 'tier-1';
  if (tier.includes('2')) return 'tier-2';
  return 'tier-3';
}

export function tierLabel(tier) {
  if (!tier) return '';
  if (tier.includes('1')) return 'Priority';
  if (tier.includes('2')) return 'Strong';
  return 'Lower';
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function companyInitials(name) {
  if (!name) return '?';
  // Use first letters of each word, max 2
  const words = name.split(/[\s&]+/).filter(w => w.length > 0);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function setNav(active) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === active);
  });
}
