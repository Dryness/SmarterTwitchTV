package android.net;

/** Minimal javac-time stand-in for the Android Uri, only what AdPlaylistFilter reads. */
public class Uri {
    private final String s;

    private Uri(String s) {
        this.s = s;
    }

    public static Uri parse(String s) {
        return new Uri(s);
    }

    public String getHost() {
        int start = s.indexOf("://") + 3;
        int end = s.indexOf('/', start);
        return end < 0 ? s.substring(start) : s.substring(start, end);
    }

    public String getPath() {
        int start = s.indexOf("://") + 3;
        int end = s.indexOf('/', start);
        return end < 0 ? null : s.substring(end);
    }

    @Override
    public String toString() {
        return s;
    }
}
