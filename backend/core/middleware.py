from whitenoise.middleware import WhiteNoiseMiddleware


class ZappaWhiteNoiseMiddleware(WhiteNoiseMiddleware):
    """Serve static files at /static/ path even when STATIC_URL has a stage prefix.

    API Gateway strips /production before forwarding to Lambda, so incoming
    requests arrive at /static/... but STATIC_URL is /production/static/...
    """

    def __init__(self, get_response=None, *args, **kwargs):
        super().__init__(get_response, *args, **kwargs)
        # Re-add static files at the /static/ prefix (what Lambda actually receives)
        if self.static_root and self.static_prefix != "/static/":
            self.add_files(self.static_root, prefix="/static/")
