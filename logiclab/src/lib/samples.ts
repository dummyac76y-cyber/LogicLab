// ============ Sample expressions for quick loading ============
export interface Sample {
  label: string
  expression: string
  description: string
}

export const SAMPLES: Sample[] = [
  {
    label: "Test case",
    expression: "F1 = A'B' + CB' + ADC + BC'D",
    description: 'The classic LogicLab test — Σm(0,1,2,3,5,10,11,13,15)',
  },
  {
    label: 'Simple 2-term',
    expression: 'F1 = AB + A\'B',
    description: 'Simplifies to F1 = B',
  },
  {
    label: 'Half adder carry',
    expression: 'F1 = ABCD + ABC\'D + AB\'CD + AB\'C\'D',
    description: 'Four minterms with shared factors',
  },
  {
    label: 'With parentheses',
    expression: 'F1 = (A+B)C + A\'BC\'',
    description: 'Demonstrates distribution of OR over AND',
  },
  {
    label: 'Three variables',
    expression: 'F1 = A\'BC + AB\'C + ABC\' + ABC',
    description: 'Uses only A, B, C — D is free',
  },
  {
    label: 'Redundant terms',
    expression: 'F1 = A\'B\' + CB\' + ADC + BC\'D + A\'BD',
    description: 'Same function as the test case plus a redundant term',
  },
]
