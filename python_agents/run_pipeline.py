import time
import subprocess

while True:
    print("Running intelligence ingestion...")
    subprocess.run(["python3", "intelligence_ingest.py"])

    print("Running fusion engine...")
    subprocess.run(["python3", "fusion_engine.py"])

    print("Sleeping for 30 minutes...")
    time.sleep(1800)
