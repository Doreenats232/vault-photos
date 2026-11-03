package com.miles.vaultphotos;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;

class Sync {
  static HttpURLConnection conn(Context x, String path) throws Exception {
    SharedPreferences p = x.getSharedPreferences("vp", 0);
    HttpURLConnection h = (HttpURLConnection) new URL(p.getString("url", "") + path).openConnection();
    h.setRequestProperty("Authorization", "Bearer " + p.getString("token", ""));
    h.setConnectTimeout(30000); h.setReadTimeout(120000);
    return h;
  }
  static void post(Context x, InputStream in, long len, String name, long taken, String kind) throws Exception {
    String b = "----vp" + System.nanoTime();
    byte[] hb = ("--" + b + "\r\nContent-Disposition: form-data; name=\"taken\"\r\n\r\n" + taken + "\r\n--" + b + "\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\n" + kind + "\r\n--" + b + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + name.replaceAll("[^\\w.\\-]", "_") + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes("UTF-8");
    byte[] tb = ("\r\n--" + b + "--\r\n").getBytes("UTF-8");
    HttpURLConnection h = conn(x, "/api/upload");
    h.setRequestMethod("POST"); h.setDoOutput(true);
    h.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + b);
    h.setFixedLengthStreamingMode(hb.length + len + tb.length);
    try (OutputStream o = h.getOutputStream()) {
      o.write(hb); byte[] buf = new byte[65536]; int r;
      while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
      o.write(tb);
    }
    int code = h.getResponseCode();
    h.disconnect();
    if (code >= 300) throw new IOException("Upload failed (" + code + ")");
  }
  static int run(Context x) throws Exception {
    if (x.getSharedPreferences("vp", 0).getString("token", "").isEmpty()) return 0;
    HttpURLConnection g = conn(x, "/api/photos");
    if (g.getResponseCode() != 200) throw new IOException("List failed (" + g.getResponseCode() + ")");
    JSONArray a = new JSONObject(new Scanner(g.getInputStream(), "UTF-8").useDelimiter("\\A").next()).getJSONArray("items");
    Set<String> have = new HashSet<>();
    for (int i = 0; i < a.length(); i++) have.add(a.getString(i));
    int n = 0;
    try (Cursor c = x.getContentResolver().query(MediaStore.Files.getContentUri("external"),
        new String[]{"_id", "_display_name", "_size", "date_added", "media_type"}, "media_type IN (1,3)", null, "date_added DESC")) {
      while (c != null && c.moveToNext() && n < 40) {
        String name = c.getString(1) == null ? "file" : c.getString(1);
        long size = c.getLong(2), taken = c.getLong(3) * 1000;
        if (size <= 0 || size > 100000000L || have.contains(taken + "_" + name.replaceAll("[^\\w.\\-]", "_"))) continue;
        Uri u = ContentUris.withAppendedId(c.getInt(4) == 3 ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0));
        try (InputStream in = x.getContentResolver().openInputStream(u)) { post(x, in, size, name, taken, ""); n++; }
      }
    }
    return n;
  }
}
