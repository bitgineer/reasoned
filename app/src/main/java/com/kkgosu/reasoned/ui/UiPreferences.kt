package com.kkgosu.reasoned.ui

/**
 * Spacing on the session screen. The multiplier scales dp padding only, never type sizes.
 */
enum class Density(val id: String, val spacing: Float) {
    COMPACT("compact", 0.75f),
    COMFORTABLE("comfortable", 1f),
    ROOMY("roomy", 1.25f);

    companion object {
        val DEFAULT = COMFORTABLE

        fun parse(value: String?): Density =
            entries.firstOrNull { it.id.equals(value, ignoreCase = true) } ?: DEFAULT
    }
}

/**
 * What the transcript does while a question card is open and the keyboard is showing.
 */
enum class KeyboardBehaviour(val id: String) {
    KEEP("keep"),
    HIDE("hide"),
    DIM("dim");

    companion object {
        val DEFAULT = HIDE

        fun parse(value: String?): KeyboardBehaviour =
            entries.firstOrNull { it.id.equals(value, ignoreCase = true) } ?: DEFAULT
    }
}

/**
 * Whether the dock keeps the model and thinking buttons while the keyboard is open.
 */
enum class DockWhileTyping(val id: String) {
    SHOW("show"),
    HIDE("hide");

    companion object {
        val DEFAULT = SHOW

        fun parse(value: String?): DockWhileTyping =
            entries.firstOrNull { it.id.equals(value, ignoreCase = true) } ?: DEFAULT
    }
}

data class UiPreferences(
    val density: Density = Density.DEFAULT,
    val keyboard: KeyboardBehaviour = KeyboardBehaviour.DEFAULT,
    val dock: DockWhileTyping = DockWhileTyping.DEFAULT,
) {
    companion object {
        val DEFAULT = UiPreferences()

        /** Unknown and absent values fall back to each preference's default. */
        fun parse(density: String?, keyboard: String?, dock: String?): UiPreferences =
            UiPreferences(
                Density.parse(density),
                KeyboardBehaviour.parse(keyboard),
                DockWhileTyping.parse(dock)
            )
    }
}
