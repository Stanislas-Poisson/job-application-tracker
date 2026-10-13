import base from '@stanislas-poisson/js-dev-tools/stylelint'

// The pages are ready for right-to-left and vertical writing: sides are said as start and end, block and inline
// (margin-inline-start, inset-inline-end, text-align: start), never as left, right, top or bottom.
export default {
  ...base,
  rules: {
    ...base.rules,
    'property-disallowed-list': [
      [
        '/^(margin|padding)-(left|right|top|bottom)$/',
        '/^border-(left|right|top|bottom)(-.+)?$/',
        '/^scroll-(margin|padding)-(left|right|top|bottom)$/',
        'left',
        'right',
        'top',
        'bottom',
      ],
      { message: 'Use the logical property (start, end, block, inline), so that the page can be mirrored.' },
    ],
    'declaration-property-value-disallowed-list': [
      { 'text-align': ['left', 'right'], float: ['left', 'right'], clear: ['left', 'right'] },
      { message: 'Use start and end instead of left and right.' },
    ],
  },
}
