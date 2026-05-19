module.exports = {
  apps: [
    {
      name: "wa-agent",
      script: "venv/bin/uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 6666 --workers 2",
      cwd: __dirname,
      interpreter: "none",
      env: {
        PYTHONUNBUFFERED: "1",
      },
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "/var/log/wa-agent.out.log",
      error_file: "/var/log/wa-agent.err.log",
      time: true,
    },
  ],
};
