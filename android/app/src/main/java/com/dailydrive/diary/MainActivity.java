package com.dailydrive.diary;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register standard JS interface for sharing files (export)
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void shareFile(String base64Data, String fileName, String mimeType) {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    File cachePath = getCacheDir();
                    File file = new File(cachePath, fileName);
                    FileOutputStream os = new FileOutputStream(file);
                    os.write(bytes);
                    os.close();
                    
                    Uri uri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        file
                    );
                    
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType(mimeType);
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    
                    // Launch native share sheet
                    startActivity(Intent.createChooser(intent, "Export Backup"));
                } catch (Exception e) {
                    e.printStackTrace();
                    runOnUiThread(() -> {
                        Toast.makeText(MainActivity.this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    });
                }
            }
        }, "AndroidDownloadBridge");
    }
}
