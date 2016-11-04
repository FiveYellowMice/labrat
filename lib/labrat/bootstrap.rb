require 'logger'
require 'optparse'

##
# The Bootstrap module povides initialization process of LabRat.

module LabRat::Bootstrap


  ##
  # Set up the bot but does not start it.

  def initialize(cli_options)
    STDOUT.sync = true
    @logger = Logger.new(STDOUT)
    @logger.level = Logger::Severity::INFO

    @options = Options.new('config.rb', 'var', false)

    OptionParser.new do |parser|
      parser.banner = "Usage: labrat [options]"

      parser.on('-c', '--config FILE', "Path of config file.") do |arg|
        @options.config_file_path = arg
      end

      parser.on('-d', '--data-dir DIR', "Path of data directory.") do |arg|
        @options.data_dir = arg
      end

      parser.on('-D', '--debug', "Turn on debug mode.") do
        @options.debug_mode = true
        @logger.level = Logger::Severity::DEBUG
      end

      parser.on('-h', '--help', "Show help.") do
        puts parser
        exit
      end
    end.parse!

    @config = Config.new(Config::HTTP.new, Config::Telegram.new, Config::RSS.new, Config::Twitter.new)

    self.instance_eval(File.read(@options.config_file_path))
  end


  ##
  # Yield config object, should be called by the config file.

  def configure(&block)
    block.call(@config)
  end


  ##
  # Start the bot.

  def start
    @logger.info(self.class.name) { "Starting LabRat..." }
    Thread.abort_on_exception = true

    @telegram = LabRat::Telegram.new(self)

    sleep
  end


  Options = Struct.new(:config_file_path, :data_dir, :debug_mode)

  Config = Struct.new(:http, :telegram, :rss, :twitter)

  class Config
    HTTP     = Struct.new(:address, :port)
    Telegram = Struct.new(:username, :token, :owner_id)
    RSS      = Struct.new(:url, :target_channel)
    Twitter  = Struct.new(:consumer_key, :consumer_secret, :access_token, :access_token_secret, :target_channel)
  end


end
