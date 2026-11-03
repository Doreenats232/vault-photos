package com.miles.vaultphotos;
import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import androidx.work.*;
import java.io.*;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "MediaScan", permissions = {
  @Permission(alias = "media", strings = {Manifest.permission.READ_EXTERNAL_STORAGE}),
  @Permission(alias = "media13", strings = {"android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO"})})
public class MediaScan extends Plugin {
  private String alias() { return Build.VERSION.SDK_INT >= 33 ? "media13" : "media"; }

  @PluginMethod public void configure(PluginCall c) {
    boolean on = c.getBoolean("on", false), wifi = c.getBoolean("wifi", true);
    getContext().getSharedPreferences("vp", 0).edit().putString("url", c.getString("url", "")).putString("token", c.getString("token", "")).apply();
    WorkManager wm = WorkManager.getInstance(getContext());
    if (on) {
      Constraints k = new Constraints.Builder().setRequiredNetworkType(wifi ? NetworkType.UNMETERED : NetworkType.CONNECTED).build();
      wm.enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.UPDATE, new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES).setConstraints(k).build());
    } else wm.cancelUniqueWork("sync");
    c.resolve();
  }

  @PluginMethod public void syncNow(PluginCall c) {
    if (getPermissionState(alias()) != PermissionState.GRANTED) { requestPermissionForAlias(alias(), c, "afterPerm"); return; }
    new Thread(() -> {
      try { JSObject r = new JSObject(); r.put("uploaded", Sync.run(getContext())); c.resolve(r); }
      catch (Exception e) { c.reject(String.valueOf(e.getMessage())); }
    }).start();
  }

  @PermissionCallback private void afterPerm(PluginCall c) {
    if (getPermissionState(alias()) == PermissionState.GRANTED) syncNow(c); else c.reject("Photo permission was denied");
  }

  @PluginMethod public void apps(PluginCall c) {
    JSArray a = new JSArray(); PackageManager pm = getContext().getPackageManager();
    for (ApplicationInfo i : pm.getInstalledApplications(0)) {
      if ((i.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
      JSObject o = new JSObject(); o.put("pkg", i.packageName); o.put("label", String.valueOf(pm.getApplicationLabel(i))); o.put("size", new File(i.sourceDir).length()); a.put(o);
    }
    JSObject r = new JSObject(); r.put("apps", a); c.resolve(r);
  }

  @PluginMethod public void backupApp(PluginCall c) {
    String pkg = c.getString("pkg", "");
    new Thread(() -> {
      try {
        ApplicationInfo i = getContext().getPackageManager().getApplicationInfo(pkg, 0); File f = new File(i.sourceDir);
        try (InputStream in = new FileInputStream(f)) { Sync.post(getContext(), in, f.length(), pkg + ".apk", System.currentTimeMillis(), "app"); }
        c.resolve();
      } catch (Exception e) { c.reject(String.valueOf(e.getMessage())); }
    }).start();
  }
}
