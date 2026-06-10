package com.enolo.app.util

import java.text.NumberFormat
import java.util.Locale

object Formatters {
    private val ruLocale = Locale("ru", "RU")
    private val ruNumberFormat = NumberFormat.getNumberInstance(ruLocale).apply {
        maximumFractionDigits = 0
        isGroupingUsed = true
    }

    fun price(value: Double): String = ruNumberFormat.format(value.toLong())

    fun volumeLitres(ml: Int?): String? {
        if (ml == null || ml <= 0) return null
        val litres = ml.toDouble() / 1000.0
        return if (litres == litres.toLong().toDouble()) "${litres.toLong()} л" else "$litres л"
    }

    fun wineTypeRu(type: String?): String = when (type?.uppercase()) {
        "RED" -> "Красное"
        "WHITE" -> "Белое"
        "ROSE" -> "Розовое"
        "SPARKLING" -> "Игристое"
        "SWEET" -> "Десертное"
        "FORTIFIED" -> "Креплёное"
        "ORANGE" -> "Оранжевое"
        else -> ""
    }

    fun confidenceLabel(c: String): String = when (c.lowercase()) {
        "high" -> "Высокая"
        "medium" -> "Средняя"
        else -> "Низкая"
    }
}
