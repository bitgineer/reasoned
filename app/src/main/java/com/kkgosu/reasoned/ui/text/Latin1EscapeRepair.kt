package com.kkgosu.reasoned.ui.text

/** U+00C3 U+00BC followed by two hex digits is a model escape whose prefix was lost before display. */
private const val LOST_ESCAPE_PREFIX = "\u00c3\u00bc"

private val latin1Escape = Regex("$LOST_ESCAPE_PREFIX([0-9a-fA-F]{2})")

/** Display-only recovery of that escape pair. Stored text, grading and the wire stay untouched. */
internal fun repairLatin1Escapes(text: String): String {
    if (!text.contains(LOST_ESCAPE_PREFIX)) return text
    return latin1Escape.replace(text) { match ->
        val code = match.groupValues[1].toInt(16)
        if (code in 0x80..0xff) code.toChar().toString() else match.value
    }
}
