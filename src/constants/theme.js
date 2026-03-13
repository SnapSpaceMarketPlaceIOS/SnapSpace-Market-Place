// ─────────────────────────────────────────────────────────────────────────────
// theme.js — Thin re-export shim.
// All values live in tokens.js. This file exists only so screens that
// `import { colors as C } from '../constants/theme'` or
// `import theme from '../constants/theme'` continue to work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export {
  uiColors as colors,
  typography,
  fontWeight,
  space,
  radius,
  shadow,
} from './tokens';

import {
  uiColors,
  typography,
  fontWeight,
  space,
  radius,
  shadow,
} from './tokens';

const theme = {
  colors:     uiColors,
  typography,
  fontWeight,
  space,
  radius,
  shadow,
};

export default theme;
