package com.kkgosu.reasoned

import com.kkgosu.reasoned.ui.Density
import com.kkgosu.reasoned.ui.DockWhileTyping
import com.kkgosu.reasoned.ui.KeyboardBehaviour
import com.kkgosu.reasoned.ui.UiPreferences
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.roundToInt

class UiPreferencesTest {
    @Test
    fun defaultsAreComfortableHideAndShow() {
        assertEquals(Density.COMFORTABLE, Density.DEFAULT)
        assertEquals(KeyboardBehaviour.HIDE, KeyboardBehaviour.DEFAULT)
        assertEquals(DockWhileTyping.SHOW, DockWhileTyping.DEFAULT)
        assertEquals(UiPreferences.DEFAULT, UiPreferences.parse(null, null, null))
        assertEquals(
            UiPreferences(Density.COMFORTABLE, KeyboardBehaviour.HIDE, DockWhileTyping.SHOW),
            UiPreferences()
        )
    }

    @Test
    fun everyIdRoundTrips() {
        for (value in Density.entries) assertEquals(value, Density.parse(value.id))
        for (value in KeyboardBehaviour.entries)
            assertEquals(value, KeyboardBehaviour.parse(value.id))
        for (value in DockWhileTyping.entries) assertEquals(value, DockWhileTyping.parse(value.id))
        assertEquals(
            UiPreferences(Density.ROOMY, KeyboardBehaviour.DIM, DockWhileTyping.HIDE),
            UiPreferences.parse("roomy", "dim", "hide")
        )
    }

    @Test
    fun unknownAndMissingValuesFallBackToDefaults() {
        assertEquals(Density.DEFAULT, Density.parse("huge"))
        assertEquals(Density.DEFAULT, Density.parse(""))
        assertEquals(KeyboardBehaviour.DEFAULT, KeyboardBehaviour.parse("slide"))
        assertEquals(DockWhileTyping.DEFAULT, DockWhileTyping.parse("collapse"))
        assertEquals(
            UiPreferences.DEFAULT,
            UiPreferences.parse("huge", "slide", "collapse")
        )
    }

    @Test
    fun idsMatchCaseInsensitively() {
        assertEquals(Density.ROOMY, Density.parse("Roomy"))
        assertEquals(Density.COMPACT, Density.parse("COMPACT"))
        assertEquals(KeyboardBehaviour.DIM, KeyboardBehaviour.parse("Dim"))
        assertEquals(DockWhileTyping.HIDE, DockWhileTyping.parse("Hide"))
    }

    @Test
    fun densityMultipliersScaleAndRoundDp() {
        assertEquals(0.75f, Density.COMPACT.spacing, 0f)
        assertEquals(1f, Density.COMFORTABLE.spacing, 0f)
        assertEquals(1.25f, Density.ROOMY.spacing, 0f)
        assertEquals(12, (16 * Density.COMPACT.spacing).roundToInt())
        assertEquals(16, (16 * Density.COMFORTABLE.spacing).roundToInt())
        assertEquals(20, (16 * Density.ROOMY.spacing).roundToInt())
        assertEquals(42, (56 * Density.COMPACT.spacing).roundToInt())
        assertEquals(56, (56 * Density.COMFORTABLE.spacing).roundToInt())
        assertEquals(70, (56 * Density.ROOMY.spacing).roundToInt())
    }
}
