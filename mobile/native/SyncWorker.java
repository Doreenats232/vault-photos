package com.miles.vaultphotos;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
public class SyncWorker extends Worker {
  public SyncWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
  @NonNull @Override public Result doWork() {
    try { Sync.run(getApplicationContext()); return Result.success(); } catch (Exception e) { return Result.retry(); }
  }
}
