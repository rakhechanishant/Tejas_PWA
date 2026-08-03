// ─── Number to Words (Nepali Rupees) ──────────────────────────────────────────
// Converts a numeric amount to English words with "Nepalese Rupee" prefix.

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertHundreds(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n] + ' '
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' '
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100)
}

export function numberToWords(amount: number): string {
    if (amount === 0) return 'Zero Rupees Only'
    const rupees = Math.floor(amount)
    const paisa = Math.round((amount - rupees) * 100)

    let words = 'Nepalese Rupee '

    if (rupees >= 10000000) {
        words += convertHundreds(Math.floor(rupees / 10000000)) + 'Crore '
        const rem = rupees % 10000000
        if (rem >= 100000) words += convertHundreds(Math.floor(rem / 100000)) + 'Lakh '
        if (rem % 100000 >= 1000) words += convertHundreds(Math.floor((rem % 100000) / 1000)) + 'Thousand '
        if (rem % 1000 >= 100) words += convertHundreds(Math.floor((rem % 1000) / 100)) + 'Hundred '
        words += convertHundreds(rem % 100)
    } else if (rupees >= 100000) {
        words += convertHundreds(Math.floor(rupees / 100000)) + 'Lakh '
        const rem = rupees % 100000
        if (rem >= 1000) words += convertHundreds(Math.floor(rem / 1000)) + 'Thousand '
        words += convertHundreds(rem % 1000)
    } else if (rupees >= 1000) {
        words += convertHundreds(Math.floor(rupees / 1000)) + 'Thousand '
        words += convertHundreds(rupees % 1000)
    } else {
        words += convertHundreds(rupees)
    }

    words = words.trim()
    if (paisa > 0) {
        words += ' and Paisa ' + convertHundreds(paisa).trim()
    }
    return words + ' Only'
}

export const formatNPR = (val: number | null | undefined) =>
    'रु ' + (val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const today = () => new Date().toISOString().split('T')[0]

export const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-GB') : '—'

export const formatDateTime = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
