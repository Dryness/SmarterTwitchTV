package android.util;

/** javac-time stand-in for android.util.Log, prints so test output shows the filter decisions. */
public class Log {
    public static int i(String tag, String msg) {
        System.out.println("I/" + tag + ": " + msg);
        return 0;
    }

    public static int e(String tag, String msg) {
        System.out.println("E/" + tag + ": " + msg);
        return 0;
    }

    public static int e(String tag, String msg, Throwable t) {
        System.out.println("E/" + tag + ": " + msg + " " + t);
        return 0;
    }
}
