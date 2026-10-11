package ai.saferoute.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark theme status bar and navigation bar (matching Women's Safety Slate-950 theme)
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF030812);
        window.setNavigationBarColor(0xFF030812);

        webView = new WebView(this);
        setContentView(webView);

        setupWebView();
        requestAppPermissions();

        // Load the Women's Safety web application through secure local scheme
        webView.loadUrl("https://saferoute.local/index.html");
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String[] permissions = new String[] {
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            };
            boolean needRequest = false;
            for (String p : permissions) {
                if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            if (needRequest) {
                requestPermissions(permissions, PERMISSION_REQUEST_CODE);
            }
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Hardware acceleration
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();

                if ("tel".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_DIAL, uri);
                    startActivity(intent);
                    return true;
                } else if ("sms".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
                    startActivity(intent);
                    return true;
                } else if ("mailto".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
                    startActivity(intent);
                    return true;
                } else if ("geo".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } else if ("wa.me".equalsIgnoreCase(host) || "api.whatsapp.com".equalsIgnoreCase(host) || "whatsapp".equalsIgnoreCase(scheme)) {
                    // Open WhatsApp alert link in native WhatsApp app or browser
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } else if (uri.toString().contains("SafeRoute-AI.apk") || uri.toString().contains("download-apk")) {
                    // Open browser for external APK downloads
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("saferoute.local".equalsIgnoreCase(uri.getHost())) {
                    String path = uri.getPath();
                    if (path == null || path.isEmpty() || "/".equals(path)) {
                        path = "/index.html";
                    }

                    // Synthetic mock endpoints for app self-contained execution
                    if ("/api/health".equals(path)) {
                        String json = "{\"status\":\"healthy\",\"service\":\"Women's Safety Android App\",\"version\":\"2.2.0\",\"ai_engine_active\":true,\"database\":{\"engine\":\"SQLite 3\",\"sqlite_version\":\"3.45.1\",\"journal_mode\":\"WAL\",\"file_size_kb\":48,\"total_records\":25,\"file_path\":\"backend/data/saferoute.db\",\"tables\":{\"safe_havens\":10,\"incidents\":9,\"contacts\":2,\"sos_logs\":1,\"route_evaluations\":3}}}";
                        return createJsonResponse(json);
                    }
                    if ("/api/config".equals(path)) {
                        String json = "{\"mapboxToken\":\"\",\"env\":\"production\",\"app\":\"Women's Safety Android\"}";
                        return createJsonResponse(json);
                    }

                    String assetPath = "www" + path;
                    String mime = getMimeType(path);
                    try {
                        InputStream stream = getAssets().open(assetPath);
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream);
                    } catch (Exception e) {
                        try {
                            InputStream streamAlt = getAssets().open(assetPath.replace('/', '\\'));
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Access-Control-Allow-Origin", "*");
                            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, streamAlt);
                        } catch (Exception e2) {
                            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null);
                        }
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }

    private WebResourceResponse createJsonResponse(String json) {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Content-Type", "application/json; charset=utf-8");
        return new WebResourceResponse("application/json", "UTF-8", 200, "OK", headers, new ByteArrayInputStream(bytes));
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("Boolean(window.handleAppBack && window.handleAppBack())", value -> {
                runOnUiThread(() -> {
                    if ("true".equalsIgnoreCase(value)) {
                        // Handled by web app (closed modal or navigated to previous screen)
                        return;
                    }
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        MainActivity.super.onBackPressed();
                    }
                });
            });
        } else {
            super.onBackPressed();
        }
    }
}
