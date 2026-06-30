package com.enolo.app.ui.root

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WineBar
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.enolo.app.ui.theme.TokenInk3
import com.enolo.app.ui.theme.TokenTeal
import com.enolo.app.ui.theme.TokenTealWash

data class BottomNavItem(
    val route: String,
    val label: String,
    val icon: ImageVector
)

val bottomNavItems = listOf(
    BottomNavItem("home",      "Главная",   Icons.Default.Home),
    BottomNavItem("discounts", "Скидки",    Icons.Default.LocalOffer),
    BottomNavItem("cellar",    "Погреб",    Icons.Default.WineBar),
    BottomNavItem("favorites", "Избранное", Icons.Default.FavoriteBorder),
    BottomNavItem("settings",  "Настройки", Icons.Default.Settings),
)

@Composable
fun MerloticBottomBar(navController: NavController) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = androidx.compose.ui.unit.Dp.Hairline
    ) {
        bottomNavItems.forEach { item ->
            val selected = currentRoute == item.route
            NavigationBarItem(
                icon    = { Icon(item.icon, contentDescription = item.label) },
                label   = {
                    Text(
                        item.label,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = if (selected)
                                androidx.compose.ui.text.font.FontWeight.SemiBold
                            else
                                androidx.compose.ui.text.font.FontWeight.Medium
                        )
                    )
                },
                selected = selected,
                colors   = NavigationBarItemDefaults.colors(
                    selectedIconColor   = TokenTeal,
                    selectedTextColor   = TokenTeal,
                    indicatorColor      = TokenTealWash,
                    unselectedIconColor = TokenInk3,
                    unselectedTextColor = TokenInk3,
                ),
                onClick = {
                    if (currentRoute != item.route) {
                        navController.navigate(item.route) {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState    = true
                        }
                    }
                }
            )
        }
    }
}
