package com.enolo.app.ui.root

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.enolo.app.ui.cellar.CellarScreen
import com.enolo.app.ui.discounts.DiscountsScreen
import com.enolo.app.ui.favorites.FavoritesScreen
import com.enolo.app.ui.home.HomeScreen

/** Valid deep-link routes that can arrive via push notification. */
private val PUSH_ROUTES = setOf("home", "discounts", "cellar", "favorites")

@Composable
fun MainScaffold(rootViewModel: RootViewModel) {
    val navController = rememberNavController()
    val pendingRoute by rootViewModel.pendingRoute.collectAsState()

    // Navigate to route from push notification tap
    LaunchedEffect(pendingRoute) {
        val route = pendingRoute?.takeIf { it in PUSH_ROUTES } ?: return@LaunchedEffect
        navController.navigate(route) {
            popUpTo(navController.graph.startDestinationId) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
        rootViewModel.clearPendingRoute()
    }

    Scaffold(
        bottomBar = { MerloticBottomBar(navController) }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("home") {
                HomeScreen(
                    onNavigateToDiscounts = {
                        navController.navigate("discounts") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState    = true
                        }
                    },
                    onNavigateToCellar = {
                        navController.navigate("cellar") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState    = true
                        }
                    }
                )
            }
            composable("discounts") { DiscountsScreen() }
            composable("cellar") { CellarScreen() }
            composable("favorites") { FavoritesScreen() }
        }
    }
}
