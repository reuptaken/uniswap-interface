import { Flex, Text } from '@universe/mycelium'

// Equal-width digits, so right-aligned numbers line up digit for digit down a column.
export const TABULAR_NUMBERS = { fontVariantNumeric: 'tabular-nums' } as const

export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** hh:mm:ss, local time. */
export function formatSwapTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  // Time only: the list covers the last 15 minutes, so the day and month never tell rows apart.
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export function rawToNumber(raw: bigint, decimals: number): number {
  const abs = raw < 0n ? -raw : raw
  return Number(abs) / 10 ** decimals
}

export function ExplorerLink({ url, label }: { url: string; label: string }): JSX.Element {
  return (
    <Text
      variant="body3"
      // Muted: the links are secondary to the numbers.
      color="$neutral2"
      cursor="pointer"
      hoverStyle={{ color: '$neutral1' }}
      numberOfLines={1}
      style={TABULAR_NUMBERS}
      onPress={() => window.open(url, '_blank', 'noopener,noreferrer')}
    >
      {label}
    </Text>
  )
}

/** A formatted number split at its decimal separator: [whole part, separator + fraction]. */
export function splitAtDecimal(text: string, separator: string): [string, string] {
  const index = text.lastIndexOf(separator)
  return index === -1 ? [text, ''] : [text.slice(0, index), text.slice(index)]
}

/**
 * A number laid out so a column of them lines up on the decimal separator: the whole part right-aligned, the fraction
 * in a slot as wide as the column's longest fraction (in digit widths, with tabular digits).
 */
export function DecimalAlignedNumber({
  text,
  separator,
  fractionChars,
  color,
}: {
  text: string
  separator: string
  fractionChars: number
  color?: string
}): JSX.Element {
  const [whole, fraction] = splitAtDecimal(text, separator)
  return (
    <Text variant="body3" color={color} numberOfLines={1} style={TABULAR_NUMBERS}>
      {whole}
      <Text
        variant="body3"
        color={color}
        style={{ ...TABULAR_NUMBERS, display: 'inline-block', width: `${fractionChars}ch`, textAlign: 'left' }}
      >
        {fraction}
      </Text>
    </Text>
  )
}

export function HeaderCell({
  children,
  width,
  flex,
  alignRight = false,
}: {
  children?: string
  width?: number
  flex?: number
  alignRight?: boolean
}): JSX.Element {
  return (
    // flexBasis 0: flexible columns split the row evenly, not by content, so header and every row share their edges.
    <Flex
      width={width}
      flex={flex}
      flexBasis={flex === undefined ? undefined : 0}
      minWidth={0}
      alignItems={alignRight ? 'flex-end' : 'flex-start'}
    >
      <Text variant="body4" color="$neutral3" numberOfLines={1}>
        {children}
      </Text>
    </Flex>
  )
}
