package com.miles.vaultphotos;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle s) { registerPlugin(MediaScan.class); super.onCreate(s); }
}
