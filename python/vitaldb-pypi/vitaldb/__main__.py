"""VitalDB CLI entry point."""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(
        prog="vitaldb",
        description="VitalDB Python Library - Access VitalDB open dataset and vital files"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # MCP server subcommand
    mcp_parser = subparsers.add_parser(
        "mcp",
        help="Run VitalDB as an MCP (Model Context Protocol) server"
    )

    args = parser.parse_args()

    if args.command == "mcp":
        try:
            from vitaldb.mcp_server import run
            run()
        except ImportError as e:
            print("Error: MCP dependencies not installed.", file=sys.stderr)
            print("Install with: pip install 'vitaldb[mcp]'", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
