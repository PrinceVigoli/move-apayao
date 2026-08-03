/**
 * Semantic design tokens for the mobile apps.
 *
 * These match the MOVE Apayao brand used on the public landing site and the
 * admin dashboard — a deep Cordillera forest green as the "black", an
 * orange-red primary, and a gold accent — so the whole product family reads
 * as one product rather than three.
 *
 * Every foreground/background pair below meets WCAG AA (4.5:1 for body text,
 * 3:1 for large text and UI surfaces), in BOTH light and dark. That matters
 * more than usual here: this app is used outdoors, in sunlight, on
 * inexpensive phone screens. The previous palette's primary button sat at
 * 2.84:1, which is genuinely hard to read in those conditions.
 *
 * `primaryStrong` exists because a colour dark enough for small text is
 * slightly too dark for a large button surface. Use `primary` for filled
 * buttons and `primaryStrong` for coloured text and icons on light
 * backgrounds.
 */

const colors = {
  light: {
    text: '#0f291d',
    background: '#fbfaf9',
    foreground: '#0f291d',

    card: '#ffffff',
    cardForeground: '#0f291d',

    primary: '#da3510', // filled buttons — white text clears 4.67:1
    primaryForeground: '#ffffff',
    primaryStrong: '#cc320f', // coloured text/icons on light — 5.00:1

    secondary: '#fdf1dd',
    secondaryForeground: '#7a4a06',

    muted: '#f2f0ed',
    mutedForeground: '#5c7067',

    accent: '#f9bf1f', // gold
    accentForeground: '#0f291d', // dark on gold — 9.22:1

    destructive: '#c62828',
    destructiveForeground: '#ffffff',

    success: '#0f7a43',
    successForeground: '#ffffff',

    border: '#e5e2dc',
    input: '#d9d5cd',
  },

  dark: {
    text: '#f9f8f6',
    background: '#0a1a13',
    foreground: '#f9f8f6',

    card: '#152820',
    cardForeground: '#f9f8f6',

    // Same primary as light: white text clears 4.67:1 on it, and it still
    // separates cleanly from the dark ground (3.84:1), so one value serves
    // both schemes instead of drifting apart.
    primary: '#da3510',
    primaryForeground: '#ffffff',
    primaryStrong: '#f6775a', // lightened for text on the dark ground — 6.59:1

    secondary: '#2a2018',
    secondaryForeground: '#f6d79a',

    muted: '#24382f',
    mutedForeground: '#a8bdb4',

    accent: '#fac638',
    accentForeground: '#0c2218',

    destructive: '#ef5350',
    destructiveForeground: '#0c2218',

    success: '#34d399',
    successForeground: '#0c2218',

    border: '#2d4339',
    input: '#354c41',
  },

  radius: 12,
};

export default colors;
