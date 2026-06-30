package com.enolo.app.ui.root

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.enolo.app.ui.cellar.CellarScreen
import com.enolo.app.ui.discounts.DiscountsScreen
import com.enolo.app.ui.favorites.FavoritesScreen
import com.enolo.app.ui.home.HomeScreen
import com.enolo.app.ui.notes.NotesScreen
import com.enolo.app.ui.settings.SettingsScreen
import com.enolo.app.ui.sommelier.SommelierScreen

/** Valid deep-link routes that can arrive via push notification. */
private val PUSH_ROUTES = setOf("home", "discounts", "cellar", "favorites", "settings", "notes")

@Composable
fun MainScaffold(rootViewModel: RootViewModel) {
    val navController = rememberNavController()
    val pendingRoute by rootViewModel.pendingRoute.collectAsState()
    val pendingHomeAction by rootViewModel.pendingHomeAction.collectAsState()

    // Из погреба запросили распознавание → переходим на главную и там запускаем камеру/галерею.
    fun goHomeWithAction(action: String) {
        rootViewModel.requestHomeAction(action)
        navController.navigate("home") {
            popUpTo(navController.graph.startDestinationId) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

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

    // На экране AI-сомелье нижнюю навигацию прячем — весь экран под чат.
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    Scaffold(
        containerColor = Color.White,
        bottomBar = { if (currentRoute != "smartsearch") MerloticBottomBar(navController) }
    ) { innerPadding ->
        // Переход между разделами: текущий экран гаснет в белый, затем следующий
        // проявляется из белого (fade out → fade in через белый фон Scaffold).
        val fadeMs = 170
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding),
            enterTransition     = { fadeIn(tween(durationMillis = fadeMs, delayMillis = fadeMs)) },
            exitTransition      = { fadeOut(tween(durationMillis = fadeMs)) },
            popEnterTransition  = { fadeIn(tween(durationMillis = fadeMs, delayMillis = fadeMs)) },
            popExitTransition   = { fadeOut(tween(durationMillis = fadeMs)) },
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
                    },
                    onNavigateToNotes = {
                        navController.navigate("notes") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState    = true
                        }
                    },
                    onNavigateToSmartSearch = { navController.navigate("smartsearch") },
                    startAction = pendingHomeAction,
                    onConsumeStartAction = { rootViewModel.clearHomeAction() },
                )
            }
            composable("discounts") { DiscountsScreen() }
            composable("cellar") {
                CellarScreen(
                    onNavigateToSmartSearch = { navController.navigate("smartsearch") },
                    onRequestScan    = { goHomeWithAction("scan") },
                    onRequestGallery = { goHomeWithAction("gallery") },
                )
            }
            composable("smartsearch") {
                SommelierScreen(onBack = { navController.popBackStack() })
            }
            composable("favorites") { FavoritesScreen() }
            composable("notes") {
                NotesScreen(
                    onOpenWine = {
                        navController.navigate("cellar") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState    = true
                        }
                    }
                )
            }
            composable("settings") { SettingsScreen() }
        }
    }
}
