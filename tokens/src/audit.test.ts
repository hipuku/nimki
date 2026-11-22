import { describe, expect, it } from 'vitest'
import { auditPage, holdsComponents, type AuditNode } from './audit.ts'

const alias = { type: 'VARIABLE_ALIAS', id: 'VariableID:1:1' }
let next = 0
const node = (type: string, name: string, rest: Partial<AuditNode> = {}): AuditNode => ({
  id: `${++next}`,
  type,
  name,
  ...rest,
})

/** A component whose every value is bound, as Select's are. */
function boundItem(): AuditNode {
  return node('COMPONENT', 'State=Default', {
    fills: [{ type: 'SOLID' }],
    strokes: [{ type: 'SOLID' }],
    cornerRadius: 6,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 8,
    paddingLeft: 8,
    paddingRight: 8,
    effects: [{ type: 'DROP_SHADOW' }],
    styles: { effect: 'S:1' },
    boundVariables: {
      fills: [alias],
      strokes: [alias],
      topLeftRadius: alias,
      topRightRadius: alias,
      bottomRightRadius: alias,
      bottomLeftRadius: alias,
      itemSpacing: alias,
      paddingLeft: alias,
      paddingRight: alias,
    },
    children: [
      node('TEXT', 'Label', {
        styles: { text: 'S:2' },
        fills: [{ type: 'SOLID' }],
        boundVariables: { fills: [alias] },
      }),
      // An instance's insides belong to its main component.
      node('INSTANCE', 'Check', {
        children: [node('VECTOR', 'Stroke', { strokes: [{ type: 'SOLID' }] })],
      }),
    ],
  })
}

function pageWith(...components: AuditNode[]): AuditNode {
  return node('CANVAS', 'Select', {
    children: [
      node('FRAME', 'Board', {
        // The board around the components is presentation, not a component.
        fills: [{ type: 'SOLID' }],
        layoutMode: 'VERTICAL',
        itemSpacing: 96,
        children: [
          node('COMPONENT_SET', 'SelectItem', {
            // Figma's dashed outline around a set has a radius of 5.
            cornerRadius: 5,
            children: components,
          }),
        ],
      }),
    ],
  })
}

describe('auditPage', () => {
  it('passes a component whose every value is bound, whatever its board shows', () => {
    expect(auditPage(pageWith(boundItem()))).toEqual([])
  })

  it('names every unbound colour, corner, gap, padding, text and effect', () => {
    const bad = node('COMPONENT', 'State=Hover', {
      fills: [{ type: 'SOLID' }, { type: 'SOLID', visible: false }, { type: 'GRADIENT_LINEAR' }],
      strokes: [{ type: 'SOLID' }],
      rectangleCornerRadii: [4, 4, 0, 0],
      layoutMode: 'VERTICAL',
      layoutWrap: 'WRAP',
      itemSpacing: 8,
      counterAxisSpacing: 4,
      paddingTop: 6,
      effects: [{ type: 'DROP_SHADOW' }],
      children: [
        node('TEXT', 'Label'),
        node('INSTANCE', 'Chevron', { fills: [{ type: 'SOLID' }] }),
        node('FRAME', 'Hidden', { visible: false, fills: [{ type: 'SOLID' }] }),
      ],
    })
    expect(auditPage(pageWith(bad))).toEqual([
      'Select › Board › SelectItem › State=Hover: an unbound fill',
      'Select › Board › SelectItem › State=Hover: a gradient_linear fill',
      'Select › Board › SelectItem › State=Hover: an unbound stroke',
      'Select › Board › SelectItem › State=Hover: an unbound corner radius (4)',
      'Select › Board › SelectItem › State=Hover: an unbound gap (8)',
      'Select › Board › SelectItem › State=Hover: an unbound row gap (4)',
      'Select › Board › SelectItem › State=Hover: an unbound paddingTop (6)',
      'Select › Board › SelectItem › State=Hover: an effect without an effect style',
      'Select › Board › SelectItem › State=Hover › Label: text without a text style',
      'Select › Board › SelectItem › State=Hover › Chevron: an unbound fill',
    ])
  })

  it('skips a space-between gap, which Figma works out, and zero values', () => {
    const spread = node('COMPONENT', 'Row', {
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      itemSpacing: 40,
      paddingLeft: 0,
      cornerRadius: 0,
      effects: [{ type: 'DROP_SHADOW', visible: false }],
    })
    // A frame without auto layout keeps its padding fields but does not use them.
    const loose = node('COMPONENT', 'Loose', { layoutMode: 'NONE', itemSpacing: 8, paddingLeft: 8 })
    expect(auditPage(pageWith(spread, loose))).toEqual([])
  })
})

describe('holdsComponents', () => {
  it('finds a component or a set anywhere in a page', () => {
    expect(holdsComponents(pageWith(boundItem()))).toBe(true)
    expect(holdsComponents(node('CANVAS', 'p', { children: [node('COMPONENT', 'c')] }))).toBe(true)
    expect(holdsComponents(node('CANVAS', 'Cover', { children: [node('FRAME', 'Cover')] }))).toBe(
      false,
    )
  })
})
