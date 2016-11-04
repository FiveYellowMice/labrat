require 'uri'

##
# Util module provides utility methods.

module LabRat::Util


  attr_reader :bot, :logger, :options, :config


  URI_COMPONENT_REGEX = %r[[^#{URI::PATTERN::UNRESERVED}]]


  private


  ##
  # Setup instance variables from bot object.

  def setup_instance_variables(bot)
    @bot = bot
    @logger = @bot.logger
    @options = @bot.options
    @config = @bot.config
  end


  def log_debug(&block)
    @logger.debug(self.class.name, &block)
  end


  def log_info(&block)
    @logger.info(self.class.name, &block)
  end


  def log_warn(&block)
    @logger.warn(self.class.name, &block)
  end


  def log_error(err)
    @logger.error(self.class.name) { "#{err} #{err.backtrace_locations[0]}" }
  end


  def encode_uri_component(str)
    URI.escape(str, URI_COMPONENT_REGEX)
  end


end
