/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ios: {
          blue:      '#007AFF',
          green:     '#34C759',
          orange:    '#FF9500',
          red:       '#FF3B30',
          purple:    '#AF52DE',
          teal:      '#32ADE6',
          indigo:    '#5856D6',
          bg:        '#F2F2F7',
          card:      '#FFFFFF',
          elevated:  '#FFFFFF',
          fill:      'rgba(120,120,128,0.12)',
          fill2:     'rgba(120,120,128,0.16)',
          separator: '#C6C6C8',
          primary:   '#000000',
          secondary: '#6C6C70',
          tertiary:  '#AEAEB2',
          label4:    '#D1D1D6',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        'ios-sm': '8px',
        'ios':    '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
      },
      boxShadow: {
        'ios-sm': '0 1px 2px rgba(0,0,0,0.06)',
        'ios':    '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'ios-lg': '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        'ios-modal': '0 20px 60px rgba(0,0,0,0.20)',
      },
      fontSize: {
        'large-title': ['34px', { lineHeight: '41px', fontWeight: '700' }],
        'title1':      ['28px', { lineHeight: '34px', fontWeight: '700' }],
        'title2':      ['22px', { lineHeight: '28px', fontWeight: '700' }],
        'title3':      ['20px', { lineHeight: '25px', fontWeight: '600' }],
        'headline':    ['17px', { lineHeight: '22px', fontWeight: '600' }],
        'body':        ['17px', { lineHeight: '22px', fontWeight: '400' }],
        'callout':     ['16px', { lineHeight: '21px', fontWeight: '400' }],
        'subhead':     ['15px', { lineHeight: '20px', fontWeight: '400' }],
        'footnote':    ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'caption1':    ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'caption2':    ['11px', { lineHeight: '13px', fontWeight: '400' }],
      },
      backdropBlur: {
        'ios': '20px',
      }
    },
  },
  plugins: [],
};
