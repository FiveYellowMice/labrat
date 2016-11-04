require 'cgi'

##
# Each method of this class except initialize is a command.

class LabRat::Telegram::CommandHandler


  include LabRat::Util


  HELP_MESSAGE = <<~END
    LabRat: Sacrifice itself, help others.
    This bot is made by @FiveYellowMice, its source code is on <a href="https://github.com/FiveYellowMice/labrat">GitHub</a>.

    Commands:
    /ping Ping!
    /gsl Get Google search URL for a keyword.
    /status <code>systemctl status labrat</code> .
    /help Show this help message.
  END


  def initialize(adapter)
    @adapter = adapter
    setup_instance_variables(adapter.bot)
  end


  def ping(command)
    @adapter.reply_message(command.message, text: 'Pong!')
  end


  def help(command)
    @adapter.reply_message(command.message, text: HELP_MESSAGE, parse_mode: 'HTML')
  end


  def gsl(command)
    @adapter.reply_message(command.message, text: "https://www.google.com/search?q=#{CGI.escape(command.arg)}")
  end


  def status(command)
    begin
      output = `systemctl status labrat 2>&1`
    rescue SystemCallError => e
      output = e.to_s
    end

    @adapter.reply_message(command.message, text: "<code>#{CGI.escape_html(output)}</code>", parse_mode: 'HTML')
  end


end
