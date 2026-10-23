//go:build linux && (desktop || dev)

package uizoom

/*
#cgo linux pkg-config: gtk+-3.0
#cgo !webkit2_41 pkg-config: webkit2gtk-4.0
#cgo webkit2_41 pkg-config: webkit2gtk-4.1
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

static void zoomWidget(GtkWidget *widget, gpointer data) {
	if (WEBKIT_IS_WEB_VIEW(widget)) {
		// A docked Web Inspector is a WebKitWebView too; it loads from inspector://.
		const char *uri = webkit_web_view_get_uri(WEBKIT_WEB_VIEW(widget));
		if (uri != NULL && g_str_has_prefix(uri, "inspector:")) {
			return;
		}
		webkit_web_view_set_zoom_level(WEBKIT_WEB_VIEW(widget), *(double *)data);
		return;
	}
	if (GTK_IS_CONTAINER(widget)) {
		gtk_container_foreach(GTK_CONTAINER(widget), zoomWidget, data);
	}
}

static gboolean applyZoom(gpointer data) {
	GList *windows = gtk_window_list_toplevels();
	for (GList *it = windows; it != NULL; it = it->next) {
		zoomWidget(GTK_WIDGET(it->data), data);
	}
	g_list_free(windows);
	g_free(data);
	return G_SOURCE_REMOVE;
}

// GTK widgets may only be touched on the main loop's thread.
static void setZoomLevel(double factor) {
	double *data = g_new(double, 1);
	*data = factor;
	g_idle_add(applyZoom, data);
}
*/
import "C"

func set(factor float64) {
	C.setZoomLevel(C.double(factor))
}

// Available reports whether set can change the zoom on this machine.
func Available() bool { return true }
