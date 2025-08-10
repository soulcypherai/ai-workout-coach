import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

class CloudWatchLogger {
  constructor() {
    this.client = new CloudWatchLogsClient({ region: "us-east-1" });
    this.logGroupName = "pitchroom-app-logs";
    this.logStreamName = "pitchroom-server-direct";
    this.sequenceToken = null;
    this.logQueue = [];
    this.isProcessing = false;

    // Initialize log stream
    this.initializeLogStream();

    // Process log queue periodically
    setInterval(() => this.processLogQueue(), 1000);
  }

  async initializeLogStream() {
    try {
      // Try to create log stream (will fail if exists, which is fine)
      await this.client.send(
        new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        }),
      );
    } catch (error) {
      // Stream already exists, get current sequence token
      await this.updateSequenceToken();
    }
  }

  async updateSequenceToken() {
    try {
      const command = new DescribeLogStreamsCommand({
        logGroupName: this.logGroupName,
        logStreamNamePrefix: this.logStreamName,
      });

      const response = await this.client.send(command);
      const logStream = response.logStreams.find(
        (stream) => stream.logStreamName === this.logStreamName,
      );

      if (logStream) {
        this.sequenceToken = logStream.uploadSequenceToken;
      }
    } catch (error) {
      console.error("Error updating sequence token:", error);
    }
  }

  log(level, message, metadata = {}) {
    const timestamp = Date.now();
    const logEntry = {
      timestamp,
      message: JSON.stringify({
        level,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    };

    this.logQueue.push(logEntry);

    // Also log to console for local development
    console.log(`[${level.toUpperCase()}] ${message}`, metadata);
  }

  async processLogQueue() {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    let batch = [];

    try {
      // Get batch of logs (max 100 per request to avoid limits)
      batch = this.logQueue.splice(0, 100);

      const params = {
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents: batch,
      };

      if (this.sequenceToken) {
        params.sequenceToken = this.sequenceToken;
      }

      const command = new PutLogEventsCommand(params);
      const response = await this.client.send(command);

      // Update sequence token for next batch
      this.sequenceToken = response.nextSequenceToken;
    } catch (error) {
      // console.error("Error sending logs to CloudWatch:", error);
      // Put logs back in queue to retry
      if (batch.length > 0) {
        this.logQueue.unshift(...batch);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  info(message, metadata = {}) {
    this.log("info", message, metadata);
  }

  error(message, metadata = {}) {
    this.log("error", message, metadata);
  }

  warn(message, metadata = {}) {
    this.log("warn", message, metadata);
  }

  debug(message, metadata = {}) {
    this.log("debug", message, metadata);
  }
}

export const logger = new CloudWatchLogger();
