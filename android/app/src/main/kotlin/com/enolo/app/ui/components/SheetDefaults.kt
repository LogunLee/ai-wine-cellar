package com.enolo.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Единые параметры всех ModalBottomSheet приложения. */
object MerloticSheet {
    val Shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
    val ScrimColor = Color(0x51141419)
    val HandleColor = Color(0xFFD6D6D4)
}

@Composable
fun SheetDragHandle() {
    Box(
        Modifier.padding(top = 8.dp, bottom = 4.dp)
            .size(width = 36.dp, height = 4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(MerloticSheet.HandleColor),
    )
}
