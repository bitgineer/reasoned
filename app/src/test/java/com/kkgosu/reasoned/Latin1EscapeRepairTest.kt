package com.kkgosu.reasoned

import com.kkgosu.reasoned.ui.text.repairLatin1Escapes
import org.junit.Assert.assertEquals
import org.junit.Test

class Latin1EscapeRepairTest {
    private val broken = "\u00c3\u00bc"

    @Test
    fun `repairs the reported Spanish words`() {
        assertEquals("tendría", repairLatin1Escapes("tendr${broken}eda"))
        assertEquals("olvidé", repairLatin1Escapes("olvid${broken}e9"))
        assertEquals("podrás", repairLatin1Escapes("podr${broken}e1s"))
        assertEquals("se preocupará", repairLatin1Escapes("se preocupar${broken}e1"))
        assertEquals("Está", repairLatin1Escapes("Est${broken}e1"))
    }

    @Test
    fun `repairs inside a sentence and leaves the rest of it alone`() {
        assertEquals(
            "Ya tendría el valor. It is replaced.",
            repairLatin1Escapes("Ya tendr${broken}eda el valor. It is replaced.")
        )
    }

    @Test
    fun `leaves text without the sequence unchanged`() {
        val plain = "Reassignment replaces the binding's value."
        assertEquals(plain, repairLatin1Escapes(plain))
        assertEquals("tenía", repairLatin1Escapes("tenía"))
    }

    @Test
    fun `accepts either hex case`() {
        assertEquals("é", repairLatin1Escapes("${broken}E9"))
    }

    @Test
    fun `leaves a sequence below latin-1 unchanged`() {
        val belowLatin1 = "${broken}4a"
        assertEquals(belowLatin1, repairLatin1Escapes(belowLatin1))
    }

    @Test
    fun `leaves a backslash escape unchanged`() {
        assertEquals("\\u00e9", repairLatin1Escapes("\\u00e9"))
    }
}
