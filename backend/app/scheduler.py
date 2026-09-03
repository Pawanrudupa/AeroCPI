"""
AeroCPI Scheduled Pipeline Runner.
Implements:
- ARCHITECTURE.md Section 3 (Daily trigger: for each route x window -> enqueue scrape job)
- ARCHITECTURE.md Section 5 (Step 8: Scheduling wrapper)
"""
import sys
import time
import logging
import argparse
from sqlmodel import Session
from backend.app.database import engine, create_db_and_tables, init_seed_user
from backend.app.scraper.basket_runner import run_full_basket_pipeline
from backend.app.index.geks import calculate_and_save_daily_indices

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("aerocpi.scheduler")


def run_scheduled_cycle():
    """Run one complete scheduled data collection and index computation cycle."""
    logger.info("=== Starting AeroCPI Scheduled Collection Cycle ===")
    create_db_and_tables()
    with Session(engine) as session:
        init_seed_user(session)
        logger.info("Triggering scrape pipeline across 6 routes x 3 windows...")
        scrape_summary = run_full_basket_pipeline(session, limit_sources=False)
        logger.info(f"Scrape phase completed: {len(scrape_summary)} route runs finished.")
        
        logger.info("Recomputing multilateral GEKS-Törnqvist price indices...")
        saved_indices = calculate_and_save_daily_indices(session)
        logger.info(f"Index computation completed: {len(saved_indices)} daily index records updated.")
    logger.info("=== AeroCPI Collection Cycle Finished Successfully ===")


def main():
    parser = argparse.ArgumentParser(description="AeroCPI Automated Pipeline Scheduler")
    parser.add_argument("--once", action="store_true", help="Run once and exit (for CLI / Airflow DAG trigger)")
    parser.add_argument("--interval-minutes", type=int, default=1440, help="Interval between runs in minutes (default 24h)")
    args = parser.parse_args()

    if args.once:
        run_scheduled_cycle()
        sys.exit(0)

    logger.info(f"Starting scheduler loop with interval={args.interval_minutes} minutes...")
    while True:
        try:
            run_scheduled_cycle()
        except Exception as e:
            logger.error(f"Error during scheduled cycle: {e}", exc_info=True)
            
        time.sleep(args.interval_minutes * 60)


if __name__ == "__main__":
    main()
