package com.kkgosu.reasoned.storage

import android.content.Context
import com.kkgosu.reasoned.ui.UiPreferences

/** One key per preference, committed synchronously so the next screen sees the change at once. */
class UiPreferenceStore(context: Context) {
    private val preferences = context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun load(): UiPreferences = UiPreferences.parse(
        preferences.getString(KEY_DENSITY, null),
        preferences.getString(KEY_KEYBOARD, null),
        preferences.getString(KEY_DOCK, null),
    )

    fun save(ui: UiPreferences) {
        preferences.edit()
            .putString(KEY_DENSITY, ui.density.id)
            .putString(KEY_KEYBOARD, ui.keyboard.id)
            .putString(KEY_DOCK, ui.dock.id)
            .commit()
    }

    companion object {
        const val NAME = "ui-preferences"
        const val KEY_DENSITY = "density"
        const val KEY_KEYBOARD = "keyboard"
        const val KEY_DOCK = "dock"
    }
}
