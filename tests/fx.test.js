import { usdToAud } from '../api/lib/fx'

test('converts', () => { expect(usdToAud(10, 1.5)).toBe(15) })
test('null amount -> null', () => { expect(usdToAud(null, 1.5)).toBe(null) })
test('rounds to cents', () => { expect(usdToAud(10, 1.234)).toBe(12.34) })
