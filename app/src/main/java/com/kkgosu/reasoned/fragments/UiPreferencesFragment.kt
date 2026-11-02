package com.kkgosu.reasoned.fragments

import android.app.AlertDialog
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.TextAppearanceSpan
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import com.kkgosu.reasoned.R
import com.kkgosu.reasoned.storage.UiPreferenceStore
import com.kkgosu.reasoned.ui.Density
import com.kkgosu.reasoned.ui.DockWhileTyping
import com.kkgosu.reasoned.ui.KeyboardBehaviour
import com.kkgosu.reasoned.ui.UiPreferences
import me.grishka.appkit.fragments.ToolbarFragment

/** Spacing, keyboard and dock choices applied by the session screen. */
class UiPreferencesFragment : ToolbarFragment(R.layout.fragment_shell) {
    private var pageView: View? = null
    private var dialog: AlertDialog? = null
    private var ui = UiPreferences.DEFAULT
    private val store get() = UiPreferenceStore(activity.applicationContext)

    override fun onCreateContentView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val views = inflater.inflate(R.layout.fragment_ui_preferences, container, false)
        setTitle(R.string.settings_ui)
        pageView = views
        ui = store.load()
        views.findViewById<Button>(R.id.ui_density).setOnClickListener { chooseDensity() }
        views.findViewById<Button>(R.id.ui_keyboard).setOnClickListener { chooseKeyboard() }
        views.findViewById<Button>(R.id.ui_dock).setOnClickListener { chooseDock() }
        render(views)
        return views
    }

    private fun chooseDensity() = choose(
        R.string.settings_ui_density,
        Density.entries,
        ui.density,
        ::densityLabel
    ) { ui.copy(density = it) }

    private fun chooseKeyboard() = choose(
        R.string.settings_ui_keyboard,
        KeyboardBehaviour.entries,
        ui.keyboard,
        ::keyboardLabel
    ) { ui.copy(keyboard = it) }

    private fun chooseDock() = choose(
        R.string.settings_ui_dock,
        DockWhileTyping.entries,
        ui.dock,
        ::dockLabel
    ) { ui.copy(dock = it) }

    private fun <T> choose(
        title: Int,
        values: List<T>,
        selected: T,
        label: (T) -> String,
        updated: (T) -> UiPreferences
    ) {
        dialog = AlertDialog.Builder(activity).setTitle(title)
            .setSingleChoiceItems(
                values.map(label).toTypedArray(),
                values.indexOf(selected)
            ) { picker, index ->
                apply(updated(values[index]))
                picker.dismiss()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .setOnDismissListener { dialog = null }.show()
    }

    private fun apply(next: UiPreferences) {
        ui = next
        store.save(next)
        pageView?.let(::render)
    }

    private fun render(views: View) {
        row(views, R.id.ui_density, R.string.settings_ui_density, densityLabel(ui.density))
        row(views, R.id.ui_keyboard, R.string.settings_ui_keyboard, keyboardLabel(ui.keyboard))
        row(views, R.id.ui_dock, R.string.settings_ui_dock, dockLabel(ui.dock))
    }

    private fun row(views: View, id: Int, title: Int, value: String) {
        val label = SpannableStringBuilder(getString(title)).append("\n")
        val start = label.length
        label.append(value)
        label.setSpan(
            TextAppearanceSpan(activity, R.style.TextAppearance_Harness_Meta),
            start,
            label.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        views.findViewById<Button>(id).text = label
    }

    private fun densityLabel(value: Density): String = getString(
        when (value) {
            Density.COMPACT -> R.string.settings_ui_density_compact
            Density.COMFORTABLE -> R.string.settings_ui_density_comfortable
            Density.ROOMY -> R.string.settings_ui_density_roomy
        }
    )

    private fun keyboardLabel(value: KeyboardBehaviour): String = getString(
        when (value) {
            KeyboardBehaviour.KEEP -> R.string.settings_ui_keyboard_keep
            KeyboardBehaviour.HIDE -> R.string.settings_ui_keyboard_hide
            KeyboardBehaviour.DIM -> R.string.settings_ui_keyboard_dim
        }
    )

    private fun dockLabel(value: DockWhileTyping): String = getString(
        when (value) {
            DockWhileTyping.SHOW -> R.string.settings_ui_dock_show
            DockWhileTyping.HIDE -> R.string.settings_ui_dock_hide
        }
    )

    override fun onHidden() {
        dialog?.dismiss(); dialog = null
        super.onHidden()
    }

    override fun onDestroyView() {
        dialog?.dismiss(); dialog = null
        pageView = null
        super.onDestroyView()
    }
}
